import * as THREE from 'three';
import * as OBC from '@thatopen/components';
import * as FRAGS from '@thatopen/fragments';
import * as BUI from "@thatopen/ui";

const ModelIdentifier = 'model';

class ProgressBar
{
	progressDiv: HTMLElement;

	constructor ()
	{
		this.progressDiv = document.getElementById ('progress')!;
		this.progressDiv.style.display = 'inherit';
	}

	SetText (text: string)
	{
		this.progressDiv.innerHTML = text;
	}

	Hide ()
	{
		this.progressDiv.style.display = 'none';
	}
}

async function FitModelToWindow (world: OBC.World, fragments: FRAGS.FragmentsModels)
{
	let model = fragments.models.list.get (ModelIdentifier);
	if (model === undefined || world.camera.controls === undefined) {
		return;
	}

	let boxes = await model.getBoxes ();
	let boxMinMaxPoints = [];
	for (let box of boxes) {
		boxMinMaxPoints.push (box.min);
		boxMinMaxPoints.push (box.max);
	}
	let boundingBox = new THREE.Box3 ().setFromPoints (boxMinMaxPoints);
	let boundingSphere = boundingBox.getBoundingSphere (new THREE.Sphere ());

	let perspectiveCamera = world.camera.three as THREE.PerspectiveCamera;
	let fieldOfView = perspectiveCamera.fov / 2.0;
	if (perspectiveCamera.aspect < 1.0) {
		fieldOfView = fieldOfView * perspectiveCamera.aspect;
	}

	let center = boundingSphere.center;
	let centerToEye = new THREE.Vector3 ().subVectors (perspectiveCamera.position, center).normalize ();
	let distance = boundingSphere.radius / Math.sin (THREE.MathUtils.degToRad (fieldOfView));
	let eye = new THREE.Vector3 ().addVectors (center, centerToEye.multiplyScalar (distance));

	perspectiveCamera.near = 1.0;
	perspectiveCamera.far = distance * 100.0;
	perspectiveCamera.updateProjectionMatrix ();

	world.camera.controls.setLookAt (eye.x, eye.y, eye.z, center.x, center.y, center.z, true);
	fragments.update (true);
}

async function LoadModelInternal (buffer: ArrayBuffer, world: OBC.World, fragments: FRAGS.FragmentsModels)
{
	try {
		let model = await fragments.load (buffer, { modelId: ModelIdentifier });
		model.object.addEventListener ('childadded', (ev : any) => {
			let child : THREE.Mesh = ev.child as THREE.Mesh;
			let materialArr = child.material as THREE.Material[];
			for (let material of materialArr) {
				material.side = THREE.DoubleSide;
			}
		});
		await FitModelToWindow (world, fragments);
	} catch {
	}
}

async function LoadModelFromBuffer (buffer: ArrayBuffer, world: OBC.World, fragments: FRAGS.FragmentsModels)
{
	await fragments.disposeModel (ModelIdentifier);
	fragments.update (true);

	const progressBar = new ProgressBar ();
	progressBar.SetText ('Loading model...');
	await LoadModelInternal (buffer, world, fragments);
	progressBar.Hide ();
}

async function LoadModelFromUrl (url: string, world: OBC.World, fragments: FRAGS.FragmentsModels)
{
	await fragments.disposeModel (ModelIdentifier);
	fragments.update (true);

	const progressBar = new ProgressBar ();
	try {
		progressBar.SetText ('Downloading model...');
		const file = await fetch (url);
		const buffer = await file.arrayBuffer ();
		progressBar.SetText ('Loading model...');
		await LoadModelInternal (buffer, world, fragments);
	} catch {
	}

	progressBar.Hide ();
}

async function LoadModelFromUrlHash (hash: string, world: OBC.World, fragments: FRAGS.FragmentsModels)
{
	if (hash.length === 0) {
		return;
	}
	LoadModelFromUrl (hash.substring (1), world, fragments);
}

async function Init ()
{
	const components = new OBC.Components ();
	components.init ();

	const worlds = components.get (OBC.Worlds);
	const world = worlds.create<OBC.SimpleScene, OBC.SimpleCamera, OBC.SimpleRenderer> ();

	world.scene = new OBC.SimpleScene (components);
	world.scene.setup ();
	world.scene.three.background = null;

	const container = document.getElementById ('container')!;
	world.renderer = new OBC.SimpleRenderer (components, container);

	world.camera = new OBC.SimpleCamera (components);
	world.camera.controls.setLookAt (100, 100, 100, 0, 0, 0);

	const grids = components.get (OBC.Grids);
	grids.create (world);

	const workerUrl = 'https://cdn.jsdelivr.net/npm/@thatopen/fragments@3.0.6/dist/Worker/worker.mjs';
	const fetchedWorker = await fetch (workerUrl);
	const workerText = await fetchedWorker.text ();
	const workerFile = new File ([new Blob([workerText])], 'worker.mjs', {
		type: 'text/javascript',
	});
	const workerObjectUrl = URL.createObjectURL (workerFile);

	const fragments = new FRAGS.FragmentsModels (workerObjectUrl);
	fragments.settings.autoCoordinate = false;
	world.camera.controls.addEventListener ('rest', () => fragments.update ());
	world.camera.controls.addEventListener ('update', () => fragments.update ());
	fragments.models.list.onItemSet.add (({ value: model }) => {
		world.scene.three.add (model.object);
		fragments.update (true);
	});

	const mouse = new THREE.Vector2 ();
	container.addEventListener ('click', async (event) => {
		
	});

	window.addEventListener ('dragstart', (ev) => {
		ev.preventDefault ();
	}, false);

	window.addEventListener ('dragover', (ev: any) => {
		ev.stopPropagation ();
		ev.preventDefault ();
		ev.dataTransfer.dropEffect = 'copy';
	}, false);

	window.addEventListener ('drop', async (ev: any) => {
		ev.stopPropagation ();
		ev.preventDefault ();

		if (ev.dataTransfer.items.length != 1) {
			return;
		}

		let item: DataTransferItem = ev.dataTransfer.items[0];
		let file: File | null = item.getAsFile ();
		if (file === null) {
			return;
		}

		let buffer: ArrayBuffer | undefined = await file.arrayBuffer ();
		if (buffer === undefined) {
			return;
		}

		await LoadModelFromBuffer (buffer, world, fragments);
	}, false);

	window.addEventListener ('hashchange', (ev: any) => {
		LoadModelFromUrlHash (window.location.hash, world, fragments);
	}, false);

	BUI.Manager.init ();

	const panel = BUI.Component.create<BUI.PanelSection> (() => {
		const onFitToWindow = async () => {
			await FitModelToWindow (world, fragments);
		};
		return BUI.html`
			<bim-panel id="controls-panel" active label="Fragments Viewer" class="sidebar">
			<bim-panel-section fixed label="Controls">
				<bim-button label="Fit to window" @click=${onFitToWindow}></bim-button>
			</bim-panel-section>
			<bim-panel-section fixed label="How to use?">
				<div class="section">💡 Drag and drop .frag files to this window.</div>
				<div class="section">💡 Specify model location as url hash (<a href="#stacked_towers.frag">example</a>).</div>
			</bim-panel-section>
			</bim-panel>
		`;
	});

	document.body.append (panel);
	await LoadModelFromUrlHash (window.location.hash, world, fragments);
}

Init ();
